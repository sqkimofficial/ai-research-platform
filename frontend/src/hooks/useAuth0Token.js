import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setTokenGetter } from '../services/api';

/**
 * Hook to set up Auth0 token getter for API service
 * 
 * This hook should be called once in a top-level component
 * (like Workspace) to enable the API service to get fresh tokens.
 */
const useAuth0Token = () => {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  useEffect(() => {
    if (isAuthenticated) {
      // Set the token getter for the API service
      setTokenGetter(getAccessTokenSilently);
    }
  }, [isAuthenticated, getAccessTokenSilently]);
};

export default useAuth0Token;


