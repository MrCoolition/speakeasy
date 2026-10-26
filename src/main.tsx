import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import App from './App';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="error-screen"><h1>Let’s find our footing.</h1><p>Your saved speeches are still on this device. Reload to recover your workspace.</p><button className="button primary" onClick={() => location.reload()}>Reopen Speakeasy</button><button className="button secondary" onClick={() => { const raw = localStorage.getItem('speakeasy.v1'); if (raw) { const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'speakeasy-emergency-private-vault.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); } }}>Export emergency copy</button><p className="quiet-note">The emergency copy includes your private recovery key. Keep it secure.</p></div>;
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
