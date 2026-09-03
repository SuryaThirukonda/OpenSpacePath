#!/bin/sh
# T3.7: pull selected GMAT R2026a sources from the nasa/GMAT GitHub mirror (raw files) for offline study.
OUT="$(dirname "$0")/gmat_src"
mkdir -p "$OUT"
BASE=https://raw.githubusercontent.com/nasa/GMAT/master
for f in \
 application/README.txt \
 application/api/API_README.txt \
 application/api/Ex_R2025a_MarsBPlane.py \
 application/api/Ex_R2020a_BasicForceModel.py \
 application/api/Ex_R2020a_PropagationLoop.py \
 application/api/Ex_R2025a_BasicTarget.py \
 application/data/api/GmatHelp.rst \
 application/samples/Tut_Mars_B_Plane_Targeting.script \
 application/samples/Tut_SimulatingAnOrbit.script \
 application/samples/Tut_SimpleOrbitTransfer.script \
 application/samples/Tut_Target_Finite_Burn_to_Raise_Apogee.script \
 application/samples/Ex_LunarTransfer.script \
 application/samples/Ex_HohmannTransfer.script \
 application/samples/Ex_FiniteBurn.script \
 application/samples/Ex_EclipseLocation.script \
 application/samples/Ex_StationContactLocator.script \
 application/samples/Ex_TLE_Propagation.script \
 application/samples/Ex_ForceModels.script \
 application/samples/Ex_Integrators.script \
 application/samples/Ex_MarsBPlane.script \
 application/samples/Ex_Propagate_Covariance.script \
 application/samples/Ex_Yukon_MarsLaunchWindowAnalysis.script \
 application/samples/NeedVF13ad/Ex_MarsPatchConic.script \
 application/samples/NeedVF13ad/Ex_MinFuelLunarTransfer.script \
 doc/help/src/ReleaseNotes_R2026a.xml \
 doc/help/src/ReleaseNotes_R2025a.xml \
 doc/help/src/ReleaseNotes_R2022a.xml \
 doc/help/src/Resource_ForceModel.xml \
 doc/help/src/Resource_Propagator.xml \
 doc/help/src/Resource_NumericalIntegrators.xml \
 doc/help/src/Resource_OrbitView.xml \
 doc/help/src/Resource_GroundTrack.xml \
 doc/help/src/Resource_OpenFramesInterface.xml \
 doc/help/src/Resource_DifferentialCorrector.xml \
 doc/help/src/Resource_VF13ad.xml \
 doc/help/src/Resource_FminconOptimizer.xml \
 doc/help/src/Resource_SNOPTOptimizer.xml \
 doc/help/src/Resource_Yukon.xml \
 doc/help/src/Resource_EclipseLocator.xml \
 doc/help/src/Resource_ContactLocator.xml \
 doc/help/src/Resource_FiniteBurn.xml \
 doc/help/src/Resource_ImpulsiveBurn.xml \
 doc/help/src/Resource_FuelTank.xml \
 doc/help/src/Resource_Thruster.xml \
 doc/help/src/Resource_SpacecraftOrbitState.xml \
 doc/help/src/Resource_SpacecraftBallisticMass.xml \
 doc/help/src/Resource_ExtendedKalmanFilter.xml \
 doc/help/src/Resource_BatchEstimator.xml \
 doc/help/src/Resource_CoordinateSystem.xml \
 doc/help/src/Resource_XYPlot.xml \
 doc/help/src/Resource_EphemerisPropagator.xml \
 doc/help/src/Tut_MarsB-PlaneTargeting.xml \
 doc/help/src/Tut_LunarTransfer.xml \
 doc/help/src/Tut_SimulatingAnOrbit.xml \
 doc/help/src/Tut_TargetFiniteBurn.xml \
 doc/help/src/Tut_EventLocation.xml \
 doc/help/src/System_ScriptLanguage.xml \
 doc/help/src/System_PythonInterface.xml \
 doc/help/src/System_CalculationParameters.xml \
 doc/help/src/Using_Installation.xml \
 doc/help/src/Using_UserInterfaces.xml \
 doc/help/src/Using_OrbitDesigner.xml \
 doc/help/src/Part_Tutorials.xml \
 doc/help/src/Part_RefGuide.xml \
 doc/help/src/Preface.xml \
 ; do
  name=$(echo "$f" | tr '/' '_')
  if [ ! -s "$OUT/$name" ]; then
    curl -sL --max-time 60 -o "$OUT/$name" "$BASE/$f" || echo "FAIL $f"
  fi
done
curl -sL --max-time 30 -o "$OUT/nasa_GMAT_repo_api.json" -H "Accept: application/vnd.github+json" https://api.github.com/repos/nasa/GMAT
ls -l "$OUT" | awk '{print $5, $9}'
