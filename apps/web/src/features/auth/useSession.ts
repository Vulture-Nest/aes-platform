import { useEffect } from 'react';
import { useMeQuery } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { initialized, loggedOut, userLoaded } from './authSlice';

/** Rehydrates the session on load via /auth/me (which triggers 401→refresh→retry). */
export function useSession(): { initializing: boolean } {
  const dispatch = useAppDispatch();
  const { refreshToken, user, initializing } = useAppSelector((s) => s.auth);

  const skip = !refreshToken || !!user;
  const { data, isSuccess, isError, isLoading } = useMeQuery(undefined, { skip });

  useEffect(() => {
    if (isSuccess && data) {
      dispatch(userLoaded(data));
      dispatch(initialized());
    }
  }, [isSuccess, data, dispatch]);

  useEffect(() => {
    if (isError) {
      dispatch(loggedOut());
      dispatch(initialized());
    }
  }, [isError, dispatch]);

  useEffect(() => {
    if (!refreshToken) dispatch(initialized());
  }, [refreshToken, dispatch]);

  return { initializing: initializing && !!refreshToken && (isLoading || (!user && !isError)) };
}
