import { Component, useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import {
  getModelDeliverySnapshot,
  markModelDeliveryFailure,
  resetModelDelivery,
  ResilientGLTFLoader,
  startModelDelivery,
  subscribeToModelDelivery,
} from '../lib/modelDelivery';
import { captureException } from '../lib/sentry';
import './ModelLoadSurface.css';

class ModelCanvasErrorBoundary extends Component<{ url: string; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) {
    captureException(error);
    markModelDeliveryFailure(this.props.url, error);
  }
  render() { return this.state.hasError ? null : this.props.children; }
}

export default function ModelLoadSurface({ url, children }: { url: string; children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    listener => subscribeToModelDelivery(url, listener),
    () => getModelDeliverySnapshot(url),
    () => getModelDeliverySnapshot(url),
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => { startModelDelivery(url); }, [url]);

  const retry = useCallback(() => {
    useLoader.clear(ResilientGLTFLoader, url);
    resetModelDelivery(url);
    setRetryKey(value => value + 1);
  }, [url]);

  useEffect(() => {
    if (snapshot.phase !== 'error' || !snapshot.retryable) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry, snapshot.phase, snapshot.retryable]);

  const showFeedback = snapshot.phase !== 'ready';
  const progressLabel = snapshot.progress === undefined ? '' : `${snapshot.progress}%`;

  return (
    <div className="model-load-surface">
      <ModelCanvasErrorBoundary key={`${url}:${retryKey}`} url={url}>
        {children}
      </ModelCanvasErrorBoundary>
      {showFeedback && (
        <div className={`model-load-feedback${snapshot.phase === 'error' ? ' model-load-feedback--error' : ''}`}>
          <div className="model-load-card" role={snapshot.phase === 'error' ? 'alert' : 'status'} aria-live="polite">
            {snapshot.phase === 'error' ? (
              <svg className="model-load-icon model-load-icon--error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" />
              </svg>
            ) : <span className="model-load-spinner" aria-hidden="true" />}
            <div className="model-load-copy">
              <strong>{snapshot.phase === 'error' ? '3D model unavailable' : snapshot.phase === 'parsing' ? 'Preparing 3D model…' : snapshot.phase === 'retrying' ? 'Connection interrupted' : 'Loading 3D model…'}</strong>
              <span>{snapshot.phase === 'error' ? 'Check your connection, then try again.' : snapshot.phase === 'retrying' ? 'Retrying the download…' : snapshot.progress !== undefined ? `Downloading model (${progressLabel})` : snapshot.phase === 'parsing' ? 'Almost ready.' : 'This may take a moment on mobile data.'}</span>
              {snapshot.progress !== undefined && snapshot.phase === 'loading' && (
                <progress className="model-load-progress" max={100} value={snapshot.progress} aria-label={`Model download ${progressLabel}`} />
              )}
            </div>
            {snapshot.phase === 'error' && <button type="button" className="model-load-retry" onClick={retry}>Retry</button>}
          </div>
        </div>
      )}
    </div>
  );
}
