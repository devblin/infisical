import * as express from 'express';
import { 
	IUser,
	IServiceAccount,
	IServiceTokenData,
	ISecret 
} from '../../models';

// TODO: fix (any) types
declare global {
	namespace Express {
		interface Request {
			clientIp: any;
			user: any;
			workspace: any;
			membership: any;
			targetMembership: any;
			organization: any;
			membershipOrg: any;
			integration: any;
			integrationAuth: any;
			bot: any;
			_secret: any;
			secrets: any;
			secretSnapshot: any;
			serviceToken: any;
			serviceAccount: any;
			accessToken: any;
			serviceTokenData: any;
			apiKeyData: any;
			query?: any;
			authData: {
				authMode: string;
				authPayload: IUser | IServiceAccount | IServiceTokenData;
			};
			requestData: {
				[key: string]: string
			};
		}
	}
}
