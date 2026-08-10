# Reference performance runner

M05 requires one designated, interactive user-session runner. It is not a
general CI worker and must not accept jobs from fork pull requests.

## Required fingerprint

- Ubuntu 24.04 / X11;
- Intel i7-11700K;
- NVIDIA GeForce RTX 2070 SUPER, driver 595.84;
- WebKitGTK 2.52.3;
- 1600×1000 application window at DPR 1.

The runner user needs access to the active X11 session (`DISPLAY` and Xauthority)
and NVIDIA device. Run the GitHub Actions runner as that desktop user, without
sudo or repository secrets, with labels:

```text
self-hosted,linux,x64,cutescreen-reference,rtx-2070-super
```

Register it using the short-lived token supplied by GitHub Actions for this
repository, then install it as a user service. Do not paste that token into the
repository, workflow logs or shell history.

## Before dispatch

1. Set the CPU governor to `performance`.
2. Stop GPU-intensive applications and wait for utilization ≤5% and temperature
   ≤65°C.
3. Confirm the interactive X11 session is available to the runner service.
4. Dispatch **Reference performance** with the trusted commit SHA.

The workflow invokes `pnpm test:perf:reference` three times. A preflight or
`GPU_DISJOINT` failure is infrastructure-not-ready, never a passing benchmark.
The resulting artifact must be retained and linked from M05 evidence before
changing the milestone status.
