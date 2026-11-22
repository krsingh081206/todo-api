# Kubernetes manifests: networking prerequisite (Cloud SQL private IP)

The todo-api pod connects **directly** to a Cloud SQL for PostgreSQL instance over its **private IP** on TCP 5432. There is no Cloud SQL Auth Proxy sidecar and no PostgreSQL workload, volume or Service in the cluster.

## Prerequisites

1. **VPC-native GKE cluster.** The cluster uses alias IPs (`--enable-ip-alias`), so pod IPs are routable inside the VPC. Routes-based clusters are not supported.
2. **Cloud SQL with a private IP via Private Service Access (PSA).** The instance is attached to the same VPC as the cluster, or to a VPC the cluster can reach (VPC peering, Cloud VPN or Interconnect). PSA needs:
   - an allocated IP range (`--purpose=VPC_PEERING`) in the VPC, and
   - a `servicenetworking-googleapis-com` peering between the VPC and Google's service producer network.
3. **No public IP needed.** The instance can be created with `--no-assign-ip` (private IP only).
4. **Reachability on TCP 5432.** Pod traffic to the instance's private IP must be allowed. In the same VPC, the default VPC rules and PSA allow it. Check these if you use custom setups:
   - Egress firewall rules or firewall policies that deny 5432 to the allocated range.
   - Kubernetes NetworkPolicies in `todo-app` that restrict egress.
   - Cloud SQL "authorized networks" only apply to public IP. They are not used for private IP.
   - With a peered or on-prem VPC, custom routes must be exported and imported on the peering.
   - Pod ranges are not SNATed to the node IP for the PSA range on GKE by default. If the cluster uses a non-default masquerade config, make sure traffic to the PSA range is still routable.

## Set DB_HOST

Get the private IP and write it to the ConfigMap (`k8s/db-configmap.yaml`, key `DB_HOST`; `DB_PORT` stays `5432`):

```sh
PRIVATE_IP=$(gcloud sql instances describe INSTANCE_NAME \
  --format='value(ipAddresses.filter("type:PRIVATE").extract("ipAddress").flatten())')
echo "$PRIVATE_IP"
# Replace the CLOUD_SQL_PRIVATE_IP placeholder, then apply:
sed -i "s/CLOUD_SQL_PRIVATE_IP/$PRIVATE_IP/" k8s/db-configmap.yaml
kubectl apply -f k8s/db-configmap.yaml
```

Credentials (`DB_USER`, `DB_PASSWORD`) come from the `todo-api-db-credentials` Secret. See `db-secret.example.yaml`.

## Verification

```sh
# 1. Cluster is VPC-native (expect: True / a non-empty ipAllocationPolicy)
gcloud container clusters describe CLUSTER --region REGION \
  --format='value(ipAllocationPolicy.useIpAliases,network)'

# 2. Cloud SQL has a private IP and its network
gcloud sql instances describe INSTANCE_NAME \
  --format='value(ipAddresses,settings.ipConfiguration.privateNetwork,settings.ipConfiguration.ipv4Enabled)'

# 3. Private Service Access: allocated range and peering
gcloud compute addresses list --global --filter='purpose=VPC_PEERING'
gcloud services vpc-peerings list --network=VPC_NAME
gcloud compute networks peerings list --network=VPC_NAME   # servicenetworking-googleapis-com ACTIVE

# 4. Connectivity from inside the cluster (temporary pod, removed on exit)
kubectl -n todo-app run db-check --rm -it --restart=Never --image=postgres:16-alpine -- \
  pg_isready -h "$PRIVATE_IP" -p 5432
# Alternative TCP-only check:
kubectl -n todo-app run db-check --rm -it --restart=Never --image=busybox:1.36 -- \
  nc -zv -w 5 "$PRIVATE_IP" 5432
```

Expected: `useIpAliases` is `True`, the instance shows a `PRIVATE` address on the cluster's VPC (or a reachable one), the peering is `ACTIVE`, and `pg_isready` reports `accepting connections`.

## Collector config

`otel-collector-configmap.yaml` holds the collector config (key `config.yaml`, copied from `otel-collector-config.yaml` at the repo root) and is mounted at `/etc/otelcol` in the `otel-collector` container. Apply it before the Deployment, and keep it in sync with the root file:

```sh
kubectl apply -f k8s/namespace.yaml -f k8s/db-configmap.yaml -f k8s/otel-collector-configmap.yaml
kubectl apply -f k8s/deployment.yaml
```

## Cloud Trace authentication (node service account)

The collector's `googlecloud` exporter authenticates with Application Default Credentials (ADC). On GKE, ADC resolves to the **node pool's service account** through the node metadata server. This setup uses no key files, no `GOOGLE_APPLICATION_CREDENTIALS`, no Workload Identity and no `serviceAccountName` or `iam.gke.io/gcp-service-account` annotation. Two things must be true:

1. The node pool's service account has `roles/cloudtrace.agent`.
2. The node pool has the `cloud-platform` (or `trace.append`) access scope.

Workload Identity must be **disabled** on the node pool (metadata mode `GCE_METADATA`). With it enabled, pods would use the GKE metadata server and need a KSA-to-GSA binding, which this setup doesn't have.

```sh
PROJECT_ID=your-project
CLUSTER=your-cluster
REGION=your-region
NODE_POOL=default-pool

# Find the node pool's service account ("default" means the Compute Engine default SA)
NODE_SA=$(gcloud container node-pools describe "$NODE_POOL" --cluster "$CLUSTER" --region "$REGION" \
  --format='value(config.serviceAccount)')
if [ "$NODE_SA" = "default" ]; then
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  NODE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

# 1. Grant roles/cloudtrace.agent to the node service account
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" \
  --role="roles/cloudtrace.agent"

# 2. Access scope. Scopes are fixed at node pool creation. If the pool lacks
#    cloud-platform or trace.append, create a new pool and migrate workloads:
gcloud container node-pools create trace-pool \
  --cluster "$CLUSTER" --region "$REGION" \
  --service-account "$NODE_SA" \
  --scopes=cloud-platform
#    (Alternative minimal scopes: --scopes=trace.append,logging.write,monitoring,storage-ro)
#    Then cordon/drain the old pool's nodes and delete the old pool.
#    For a new cluster, pass the same --service-account and --scopes to
#    `gcloud container clusters create`.
```

### Verification

```sh
# Role is bound to the node service account (expect one line: roles/cloudtrace.agent)
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:${NODE_SA} AND bindings.role:roles/cloudtrace.agent" \
  --format='value(bindings.role)'

# Access scopes include cloud-platform or trace.append
gcloud container node-pools describe "$NODE_POOL" --cluster "$CLUSTER" --region "$REGION" \
  --format='value(config.oauthScopes)'

# Workload Identity is off for the pool (expect empty or GCE_METADATA)
gcloud container node-pools describe "$NODE_POOL" --cluster "$CLUSTER" --region "$REGION" \
  --format='value(config.workloadMetadataConfig.mode)'

# Manifests contain no credentials or Workload Identity settings (expect no matches)
grep -rniE 'GOOGLE_APPLICATION_CREDENTIALS|credentials_file|\.json|iam\.gke\.io|serviceAccountName' \
  k8s/deployment.yaml k8s/otel-collector-configmap.yaml otel-collector-config.yaml

# Runtime: the collector logs no auth errors (PermissionDenied / insufficient scopes)
kubectl -n todo-app logs deploy/todo-api -c otel-collector | grep -iE 'permission|scope|unauthenticated' || echo "no auth errors"
```

If authentication is misconfigured, the collector logs export errors and traces are dropped. The todo-api keeps serving requests, because the app exports to the collector asynchronously through the batch processor.

## Ingress

`ingress.yaml` creates a GKE external HTTP load balancer that routes all paths to `todo-api-svc:8080`. Apply it after the Service:

```sh
kubectl apply -f k8s/service.yaml -f k8s/ingress.yaml
kubectl -n todo-app get ingress todo-api-ingress   # wait for an ADDRESS (a few minutes)
```

Note: the GCE load balancer health check defaults to `GET /` on the serving port. The API has no `/` route, so it returns 404 and the backend is marked unhealthy. Either add a `/` (or `/healthz`) route returning 200 or configure a `BackendConfig` with a health check path that returns 200, for example `GET /todos`, and annotate the Service with `cloud.google.com/backend-config`.

## Manifest consistency check

- `deployment.yaml` reads `DB_HOST`, `DB_PORT`, `DB_NAME` from ConfigMap `todo-api-db` and `DB_USER`, `DB_PASSWORD` from Secret `todo-api-db-credentials`. Nothing is hardcoded.
- `db-configmap.yaml` has `DB_PORT: "5432"` and a `DB_HOST` placeholder that must be replaced with the private IP.
- The pod has two containers (`todo-api`, `otel-collector`). There is no Cloud SQL proxy sidecar.
