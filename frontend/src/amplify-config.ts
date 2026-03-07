/**
 * Amplify configuration — reads values from Vite env variables.
 * Copy frontend/.env.example to frontend/.env.local and fill in the values
 * from the CDK stack outputs after deploying.
 */

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
      signUpVerificationMethod: 'code' as const,
    },
  },
};

export const API_URL = import.meta.env.VITE_API_URL as string;
export const WS_URL = import.meta.env.VITE_WS_URL as string;
