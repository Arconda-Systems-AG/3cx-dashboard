#!/bin/bash
set -e

NAMESPACE=3cx-api
IMAGE="ghcr.io/arconda-systems-ag/3cx-api"
TAG="${1:-latest}"

echo "🚀 3CX API Dashboard deployen – Namespace: $NAMESPACE, Image: $IMAGE:$TAG"

# 1. Namespace
echo "→ Namespace erstellen..."
kubectl apply -f k8s/namespace.yaml

# 2. Secret prüfen
if ! kubectl -n "$NAMESPACE" get secret threecx-credentials &>/dev/null; then
  echo "❌ FEHLER: Secret 'threecx-credentials' fehlt!"
  echo "   Erstelle es mit:"
  echo "   cp k8s/secret.example.yaml k8s/secret.yaml"
  echo "   (Werte eintragen, dann:)"
  echo "   kubectl apply -f k8s/secret.yaml"
  exit 1
fi
echo "✓ Secret vorhanden"

# 3. ghcr-pull-secret prüfen
if ! kubectl -n "$NAMESPACE" get secret ghcr-pull-secret &>/dev/null; then
  echo "⚠️  ghcr-pull-secret fehlt – Image Pull könnte fehlschlagen"
  echo "   Erstellen mit: kubectl create secret docker-registry ghcr-pull-secret \\"
  echo "     --docker-server=ghcr.io --docker-username=<USER> --docker-password=<TOKEN> \\"
  echo "     -n $NAMESPACE"
fi

# 4. PVC
echo "→ PVC erstellen..."
kubectl apply -f k8s/pvc.yaml

# 5. Image Tag aktualisieren (wenn kein 'latest')
if [ "$TAG" != "latest" ]; then
  echo "→ Image Tag auf $TAG setzen..."
  sed -i "s|$IMAGE:latest|$IMAGE:$TAG|g" k8s/deployment.yaml
fi

# 6. Deployment + Service
echo "→ Deployment und Service deployen..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 7. Rollout abwarten
echo "→ Warte auf Rollout..."
kubectl rollout status deployment/3cx-api -n "$NAMESPACE" --timeout=120s

# 8. Status anzeigen
echo ""
echo "✅ Deployment erfolgreich!"
echo ""
kubectl get pods -n "$NAMESPACE"
echo ""
echo "🌐 LoadBalancer IP:"
kubectl get svc 3cx-api -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
echo ""
echo ""
echo "📊 Logs anzeigen:"
echo "   kubectl logs -n $NAMESPACE -f deployment/3cx-api"
