import * as Sentry from '@sentry/node';
import request from '../config/request';
import {
  IIntegrationAuth
} from '../models';
import {
  INTEGRATION_AZURE_KEY_VAULT, 
  INTEGRATION_HEROKU,
  INTEGRATION_GITLAB,
  INTEGRATION_GCP_SECRET_MANAGER
} from '../variables';
import { RawAxiosRequestHeaders } from 'axios';
import {
  INTEGRATION_AZURE_TOKEN_URL,
  INTEGRATION_HEROKU_TOKEN_URL,
  INTEGRATION_GITLAB_TOKEN_URL,
  INTEGRATION_GCP_TOKEN_URL
} from '../variables';
import {
  IntegrationService
} from '../services';
import {
  getSiteURL,
  getClientIdAzure,
  getClientSecretAzure,
  getClientSecretHeroku,
  getClientIdGitLab,
  getClientSecretGitLab,
  getClientSecretGCPSecretManager,
  getClientIdGCPSecretManager
} from '../config';

interface RefreshTokenAzureResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: 4871;
  access_token: string;
  refresh_token: string;
}

interface RefreshTokenHerokuResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user_id: string;
}

interface RefreshTokenGitLabResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  created_at: number;
}

interface RefreshTokenGCPSecretManagerResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Return new access token by exchanging refresh token [refreshToken] for integration
 * named [integration]
 * @param {Object} obj
 * @param {String} obj.integration - name of integration
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku
 */
const exchangeRefresh = async ({
  integrationAuth,
  refreshToken
}: {
  integrationAuth: IIntegrationAuth;
  refreshToken: string;
}) => {
  
  interface TokenDetails {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: Date;
  }
  
  let tokenDetails: TokenDetails;
  try {
    switch (integrationAuth.integration) {
      case INTEGRATION_AZURE_KEY_VAULT:
        tokenDetails = await exchangeRefreshAzure({
          refreshToken
        });
        break;
      case INTEGRATION_HEROKU:
        tokenDetails = await exchangeRefreshHeroku({
          refreshToken
        });
        break;
      case INTEGRATION_GITLAB:
        tokenDetails = await exchangeRefreshGitLab({
          refreshToken
        });
        break;
      case INTEGRATION_GCP_SECRET_MANAGER:
        tokenDetails = await exchangeRefreshGCPSecretManager({
          refreshToken
        })
        break;
      default:
        throw new Error('Failed to exchange token for incompatible integration');
    }

    if (tokenDetails?.accessToken && tokenDetails?.refreshToken && tokenDetails?.accessExpiresAt) {
      await IntegrationService.setIntegrationAuthAccess({
        integrationAuthId: integrationAuth._id.toString(),
        accessId: null,
        accessToken: tokenDetails.accessToken,
        accessExpiresAt: tokenDetails.accessExpiresAt
      });

      await IntegrationService.setIntegrationAuthRefresh({
        integrationAuthId: integrationAuth._id.toString(),
        refreshToken: tokenDetails.refreshToken
      });
    }

    return tokenDetails.accessToken;
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to get new OAuth2 access token');
  }
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Azure integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Azure
 * @returns
 */
const exchangeRefreshAzure = async ({
  refreshToken
}: {
  refreshToken: string;
}) => {
  try {
    const accessExpiresAt = new Date();
    const { data }: { data: RefreshTokenAzureResponse } = await request.post(
      INTEGRATION_AZURE_TOKEN_URL,
       new URLSearchParams({
        client_id: getClientIdAzure(),
        scope: 'openid offline_access',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        client_secret: getClientSecretAzure()
      } as any)
    );
    
    accessExpiresAt.setSeconds(
      accessExpiresAt.getSeconds() + data.expires_in
    );

    return ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to get refresh OAuth2 access token for Azure'); 
  }
}

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Heroku integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku
 * @returns
 */
const exchangeRefreshHeroku = async ({
  refreshToken
}: {
  refreshToken: string;
}) => {
  try {
    const accessExpiresAt = new Date();
    const { 
      data 
    }: { 
      data: RefreshTokenHerokuResponse 
    } = await request.post(
        INTEGRATION_HEROKU_TOKEN_URL,
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_secret: getClientSecretHeroku()
        } as any)
    );

    accessExpiresAt.setSeconds(
      accessExpiresAt.getSeconds() + data.expires_in
    );

    return ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to refresh OAuth2 access token for Heroku');
  }
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GitLab integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for GitLab
 * @returns
 */
const exchangeRefreshGitLab = async ({
  refreshToken
}: {
  refreshToken: string;
}) => {
  try {
    const accessExpiresAt = new Date();
    const { 
      data
    }: { 
      data: RefreshTokenGitLabResponse 
    } = await request.post(
      INTEGRATION_GITLAB_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: getClientIdGitLab,
        client_secret: getClientSecretGitLab(),
        redirect_uri: `${getSiteURL()}/integrations/gitlab/oauth2/callback`
      } as any),
      {
        headers: {
          "Accept-Encoding": "application/json",
        }
      });

    accessExpiresAt.setSeconds(
      accessExpiresAt.getSeconds() + data.expires_in
    );

    return ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to refresh OAuth2 access token for GitLab');
  }
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GCP integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for GCP
 * @returns
 */
const exchangeRefreshGCPSecretManager = async ({
  refreshToken
}: {
  refreshToken: string;
}) => {
  try {
    const body = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_secret: getClientSecretGCPSecretManager(),
      client_id: getClientIdGCPSecretManager()
    }

    const headers: RawAxiosRequestHeaders = {
      "Accept-Encoding": "application/json"
    }

    const res: RefreshTokenGCPSecretManagerResponse = 
      (await request.post(INTEGRATION_GCP_TOKEN_URL, body, { headers })).data;

    /**
    * @note the expires_in in response shows the number of seconds after which the access_token
    * expires, so we update the infisical accessExpiresAt value to current-date-in-ms + expires_in
    * in ms
    */
    res.expires_in = Date.now() + (res.expires_in * 1000)

    return ({
      accessToken: res.access_token,
      refreshToken,
      accessExpiresAt: new Date(res.expires_in),
    })
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to refresh OAuth2 access token for GCP secret manager');
  }
};

export { exchangeRefresh };
