---
name: sdlc
description: Follow Alyosha's software development lifecycle for building and shipping services. Prefer Go services in ~/projects/alygo, deploy to k3s from ~/projects/alycluster with Helm, verify locally, and create a PR with Graphite CLI that returns the GitHub PR URL.
version: "0.1.0"
author: alyosha
---

# SDLC

Follow Alyosha's opinionated software development lifecycle for implementing, packaging, deploying, verifying, and proposing changes.

## When to use

- Use this skill when the user asks you to build a new service, add a substantial backend feature, deploy an app, ship a change to the k3s cluster, or create the final PR for that work.
- Use it when the work should follow the user's normal delivery path across `~/projects/alygo`, `~/projects/alycluster`, and Graphite CLI.
- Use it for both net-new services and meaningful changes to existing services or charts.

## Defaults

- Prefer implementing new services in `~/projects/alygo` as Go commands.
- Put executable entrypoints under `cmd/...`.
- Put shared logic under `internal/...` when it helps keep the command thin.
- Keep the implementation aligned with nearby examples instead of inventing a new project structure.
- Deploy cluster workloads from `~/projects/alycluster` using Helm charts under `charts/<service>`.
- Default to a long-running Kubernetes `Deployment` unless the user clearly asked for a scheduled or batch job, in which case use a `CronJob`.

## Exceptions

- If the user explicitly asks for a different language, framework, or repository, follow that request while preserving the same overall delivery flow.
- If Go is clearly the wrong tool for the job, say so and propose the better option instead of forcing the default.
- If the request is only for implementation, deploy only if the user asks or the task clearly includes deployment.
- If the request is only for deployment or chart work, do not force unrelated application changes.

## Repo conventions

### `~/projects/alygo`

- The repo is a single Go module rooted at `github.com/alyosha/alyscripts`.
- New services should usually fit into the existing module rather than creating a new module.
- There is no scaffolder; use an existing service as the template.
- The root `Makefile` is curated and manual. Add new build targets only when the new binary should be part of the normal local build flow.
- Dockerfiles live next to the command they package, for example `cmd/<service>/Dockerfile` or `cmd/<group>/<service>/Dockerfile`.
- Use environment variables and simple flags in the same pragmatic style as the existing repo unless the task calls for something stronger.
- Use `go test ./...` directly when validating Go code; there is no established `make test` target today.

### `~/projects/alycluster`

- Helm charts live under `charts/<service>`.
- Follow the existing chart layout with `Chart.yaml`, `values.yaml`, and `templates/`.
- Match the existing style for `Deployment`, `Service`, optional `Ingress`, labels, resource settings, and values-driven image configuration.
- Use `helm upgrade` for deploys and `kubectl` for rollout, pod, service, ingress, and log checks.
- There are no existing cron examples in the repo, so create the first `CronJob` chart carefully while staying close to the repo's Helm conventions.

## Workflow

1. Inspect the target area first.
   - Read nearby services in `~/projects/alygo` before creating a new one.
   - Read nearby Helm charts in `~/projects/alycluster` before adding or changing a deployment.
   - Reuse naming, layout, Docker, env, and chart patterns already present.
2. Implement the application change.
   - Prefer a Go service in `~/projects/alygo` unless an exception applies.
   - Create the command under `cmd/...`.
   - Add or reuse `internal/...` packages when logic should be shared or tested independently.
   - Add unit tests when they are useful and practical.
3. Validate the application.
   - Run focused tests first, then broader checks as appropriate.
   - For Go, prefer `go test ./...` and any service-specific build command needed to prove the code compiles.
   - If the new binary belongs in the normal repo build flow, update the root `Makefile`.
4. Package the workload when it should ship as a container.
   - Add a colocated `Dockerfile` following nearby examples.
   - Prefer a multi-stage build and a minimal runtime image when the service does not need a heavier runtime.
   - Use repo-relative copies that match the existing `alygo` Dockerfile style.
5. Deploy to k3s from `~/projects/alycluster` when deployment is in scope.
   - Add or update `charts/<service>`.
   - Use a `Deployment` for long-running services and a `CronJob` for scheduled work.
   - Follow existing service and ingress patterns so the app is reachable locally in the cluster.
   - Keep the chart values-driven for image repository, tag, ports, resources, and ingress settings.
6. Verify the deployment.
   - Use `helm`, `kubectl rollout status`, `kubectl get`, `kubectl describe`, `kubectl logs`, and simple local reachability checks as needed.
   - Confirm the workload is up and reachable locally before declaring success.
   - Tell the user when it is ready for `Nginx Proxy Manager` exposure if that is the next step.
7. Create the PR when the work is complete and the user asked for the workflow through PR.
   - Use Graphite CLI.
   - Use a branch name in the form `alyosha/<feature-name>` unless the user specifies something else.
   - Return the GitHub PR URL to the user, not only the Graphite link.

## Decision rules

- Choose the smallest valid path for the request.
- Do not always run the full implementation-to-PR flow when the task only needs one phase.
- When building a new service, prefer consistency with the repo over abstract best practices.
- When best practices conflict with the established repo conventions, preserve the repo's current style unless the user asks for a cleanup or stronger pattern.
- Push back when the requested stack, packaging, or deployment shape is clearly a poor fit.

## Output expectations

- Tell the user what you changed in `~/projects/alygo` and `~/projects/alycluster`.
- Call out any important implementation or deployment tradeoffs.
- If you deployed, report how you verified it locally.
- If you created a PR, share the GitHub PR URL.
