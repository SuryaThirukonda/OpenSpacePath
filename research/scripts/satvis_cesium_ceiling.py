"""Cesium/satvis main-thread ceiling implied by satvis src/modules/benchmark/README.md measurements
(M4 Pro, 2560x1440, points-only entities with SampledPositionProperty):
  0 satellites:    cpuMs+tickMs = 1.06 ms of 8.66 ms frame
  5000 satellites: cpuMs+tickMs = 14.65 ms of 14.90 ms frame
  1000 satellites (120 Hz display): main-thread 0.64 -> 1.21 ms (0 -> 1000 sats)  [different run]
"""
m0, m5k = 1.06, 14.65
slope_per_1000 = (m5k - m0) / 5.0
budget60 = 1000/60.0
sats60 = (budget60 - m0) / slope_per_1000 * 1000
sats30 = (1000/30.0 - m0) / slope_per_1000 * 1000
print(f"slope = {slope_per_1000:.2f} ms per 1,000 satellites (main thread: Cesium entity tick + preUpdate)")
print(f"60 fps budget {budget60:.2f} ms -> sats@60 ~ {sats60:,.0f} point entities (GPU floor ignored)")
print(f"30 fps -> ~ {sats30:,.0f} point entities")
print("per-satellite main-thread cost ~ %.1f us/frame (vs KeepTrack: 3 float adds + 12-byte upload per dot)" % (slope_per_1000/1000*1000))
# KeepTrack main-thread per-dot work: pos += vel*dt for 3 components + bufferSubData
# CPU side ~ maybe 2-5 ns per float op in a tight typed-array loop => 50k dots ~ 0.3-0.8 ms
for n in (50_000, 500_000, 2_500_000):
    print(f"KeepTrack extrapolation loop, N={n:,}: {n*3*3e-9*1000:.2f}-{n*3*8e-9*1000:.2f} ms/frame at 3-8 ns per element")
