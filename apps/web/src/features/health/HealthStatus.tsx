import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { checkHealth } from './healthSlice';

const LABELS: Record<string, string> = {
  idle: 'API health: not checked',
  loading: 'API health: checking…',
  online: 'API health: online',
  offline: 'API health: offline',
};

/** Small demo of the Redux Toolkit async-thunk flow against the API `/health`. */
export function HealthStatus() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.health);

  return (
    <section>
      <p>
        {LABELS[status]}
        {status === 'offline' && error ? ` (${error})` : ''}
      </p>
      <button
        type="button"
        onClick={() => dispatch(checkHealth())}
        disabled={status === 'loading'}
      >
        Check API health
      </button>
    </section>
  );
}
