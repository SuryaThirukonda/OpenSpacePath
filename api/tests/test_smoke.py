"""Environment smoke test: lamberthub solves Curtis Example 5.2."""
import numpy as np
import lamberthub


def test_lamberthub_curtis_5_2():
    r1 = np.array([5000.0, 10000.0, 2100.0])
    r2 = np.array([-14600.0, 2500.0, 7000.0])
    v1, v2 = lamberthub.izzo2015(398600.0, r1, r2, 3600.0)
    assert np.allclose(v1, [-5.99249, 1.92536, 3.24564], atol=1e-5)
    assert np.allclose(v2, [-3.31246, -4.19662, -0.38529], atol=1e-5)
