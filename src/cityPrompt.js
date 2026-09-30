// Whether the first-run city modal opens by itself on this page load. Every input must be
// known and favourable; unknown (a read that failed or has not finished) never shows it.
export function shouldAutoShowCityPrompt(input) {
  const state = input ?? {};
  return (
    state.locationRead === true &&
    state.hasLocation === false &&
    state.flagRead === true &&
    state.dismissed === false &&
    state.anyMetricEnabled === true &&
    state.weatherAvailable === true &&
    state.gridLocked === false
  );
}
