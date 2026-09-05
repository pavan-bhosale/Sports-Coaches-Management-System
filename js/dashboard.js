/**
 * VAVA Sports Academy - Central Dashboard Orchestration
 * Initializes core modules upon DOM content load.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof handleHashRoute === 'function') {
    handleHashRoute();
  }
});
