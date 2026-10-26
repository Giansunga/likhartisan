import { Component, Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import { PublicGLTFLoader, modelState, retainModel, subscribeModel, updateModelState } from '../lib/publicModelLoader';
import './model-loading.css';

class ModelBoundary extends Component<{ children: ReactNode; source: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { updateModelState(this.props.source, { phase: 'error', loaded: 0 }); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function ModelLoadSurface({ source, children }: { source: string; children: ReactNode }) {
  return <Surface key={source} source={source}>{children}</Surface>;
}

function Surface({ source, children }: { source: string; children: ReactNode }) {
  const state = useSyncExternalStore(listener => subscribeModel(source, listener), () => modelState(source));
  const [version, setVersion] = useState(0);
  useEffect(() => retainModel(source, () => useLoader.clear(PublicGLTFLoader, source)), [source]);
  const retry = () => {
    useLoader.clear(PublicGLTFLoader, source);
    updateModelState(source, { phase: 'loading', loaded: 0 });
    setVersion(value => value + 1);
  };
  const progress = state.total ? Math.min(100, Math.round(100 * state.loaded / state.total)) : undefined;
  const error = state.phase === 'error';
  const loadingLabel = state.phase === 'preparing' ? 'Preparing 3D model…' : state.phase === 'retrying' ? 'Retrying download…' : 'Loading 3D model…';
  return <div className="model-load-surface">
    <Fragment key={version}><ModelBoundary source={source}>{children}</ModelBoundary></Fragment>
    {state.phase !== 'ready' && <div className={`model-load-status${error ? ' model-load-status--error' : ''}`} role="status" aria-live="polite">
      {error ? <div className="model-load-card">
        <div><strong>3D model unavailable</strong><span>Check your connection, then try again.</span></div>
        <button type="button" onClick={retry}>Retry</button>
      </div> : <div className="model-load-indicator" aria-label={loadingLabel}>
        <span className="model-load-spinner" aria-hidden="true" />
        <span className="model-load-text">{progress !== undefined ? `${progress}%` : loadingLabel}</span>
      </div>}
    </div>}
  </div>;
}
