import { HealthStatus } from './features/health/HealthStatus';

/**
 * Scaffold shell. The role-aware layout, router (react-router-dom) and RBAC-guarded
 * routes land in later stages; here we prove the Redux + async-thunk wiring.
 */
export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>AES Operations &amp; Finance</h1>
      <p>Web client · React + Redux Toolkit + TypeScript</p>
      <HealthStatus />
    </main>
  );
}
