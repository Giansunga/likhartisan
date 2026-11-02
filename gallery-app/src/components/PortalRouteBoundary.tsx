import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { captureException } from '../lib/sentry';

class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { captureException(error); }
  render() {
    if (this.state.failed) return <section role="alert" style={{ padding: 24 }}>
      <h2>This page could not be displayed</h2>
      <p>Please try again, or choose another page from the navigation.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Try again</button>
    </section>;
    return this.props.children;
  }
}

export default function PortalRouteBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <RouteBoundary key={location.pathname}>{children}</RouteBoundary>;
}
