const isTrackerMode = process.argv.includes('--tracker');

if (isTrackerMode) {
  await import('../daemon/tracker.js');
} else {
  await import('./gui.js');
}
