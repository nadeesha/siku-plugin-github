import { PluginGenerator, IUtils, IPluginConfig, IEvent } from 'siku-plugin-sdk';

interface IUserConfig {
  username: string;
  accessToken: string;
}

export interface IGithubAuthorizationParams {
  client_id: string;
  redirect_url: string;
  scope: string;
  allow_signup: boolean;
}

export interface IGithubAuthorizationResponse {
  code: string;
}

export interface IGithubAccessTokenParams {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_url: string;
}

const trackedGithubEvents = ['PublicEvent', 'PullRequestEvent', 'PushEvent'];

const main: PluginGenerator<IUserConfig> = (utils: IUtils, pluginConfig: IPluginConfig, userConfig: IUserConfig) => {
  async function getAuthorizationUrl(): Promise<string> {
    return `https://github.com/login/oauth/authorize?client_id=${pluginConfig.clientId}&scope=user&redirect_uri=${
      pluginConfig.redirectUrl
    }`;
  }

  async function getAccessToken(authParams: IGithubAuthorizationResponse): Promise<string> {
    const response = await utils.post<IGithubAuthorizationResponse>(
      `https://github.com/login/oauth/access_token`,
      null,
      {
        client_id: pluginConfig.clientId,
        client_secret: pluginConfig.clientSecret,
        code: authParams.code,
        redirect_url: pluginConfig.redirectUrl
      }
    );

    return response.code;
  }

  async function editUserConfig(): Promise<IUserConfig> {
    const githubUser = await utils.get<{ login: string; id: string }>(
      `https://api.github.com/user?access_token=${userConfig.accessToken}`,
      null
    );

    return utils._.assign({}, userConfig, {
      username: githubUser.login,
      id: githubUser.id
    });
  }

  async function getEvents(): Promise<IEvent[]> {
    interface IGithubEvent {
      id: string;
      type: string;
      payload: any;
      created_at: string;
    }

    interface IGithubCommitEvent extends IGithubEvent {
      distinct_size: string;
    }

    const events = await utils.get<IGithubEvent[]>(`https://api.github.com/users/${userConfig.username}/events`, {});

    return utils
      ._(events)
      .filter(event => utils._.includes(trackedGithubEvents, event.type))
      .map(event => {
        const timestamp = utils.moment(event.created_at).valueOf();

        switch (event.type) {
          case 'PublicEvent': {
            return {
              id: event.id,
              timestamp,
              type: 'REPOSITORY_OPEN_SOURCED',
              multiplier: 1
            };
          }

          case 'PullRequestEvent': {
            return {
              id: event.id,
              timestamp,
              type: 'PULL_REQUEST_OPENED',
              multiplier: 1
            };
          }

          case 'PushEvent': {
            return {
              id: event.id,
              timestamp,
              type: 'COMMITS_PUSHED',
              multiplier: Number((event as IGithubCommitEvent).distinct_size)
            };
          }

          default:
            break;
        }
      })
      .value();
  }

  const eventTypes = {
    REPOSITORY_OPEN_SOURCED: { description: 'Private repo is open sourced' },
    PULL_REQUEST_OPENED: { description: 'Pull request sent for a public repo' },
    COMMITS_PUSHED: {
      description: 'One or more commits pushed tp a public rep'
    }
  };

  return {
    getAuthorizationUrl,
    getAccessToken,
    editUserConfig,
    getEvents,
    eventTypes
  };
};
