/* eslint-disable no-param-reassign */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decryptAssymmetric,
  decryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import { apiRequest } from '@app/config/request';

import { secretSnapshotKeys } from '../secretSnapshots/queries';
import {
  BatchSecretDTO,
  DecryptedSecret,
  EncryptedSecret,
  EncryptedSecretVersion,
  GetProjectSecretsDTO,
  GetSecretVersionsDTO
} from './types';

export const secretKeys = {
  // this is also used in secretSnapshot part
  getProjectSecret: (workspaceId: string, env: string) => [{ workspaceId, env }, 'secrets'],
  getSecretVersion: (secretId: string) => [{ secretId }, 'secret-versions']
};

const fetchProjectEncryptedSecrets = async (workspaceId: string, env: string) => {
  const { data } = await apiRequest.get<{ secrets: EncryptedSecret[] }>('/api/v2/secrets', {
    params: {
      environment: env,
      workspaceId
    }
  });
  return data.secrets;
};

export const useGetProjectSecrets = ({
  workspaceId,
  env,
  decryptFileKey,
  isPaused
}: GetProjectSecretsDTO) =>
  useQuery({
    // wait for all values to be available
    enabled: Boolean(decryptFileKey && workspaceId && env) && !isPaused,
    queryKey: secretKeys.getProjectSecret(workspaceId, env),
    queryFn: () => fetchProjectEncryptedSecrets(workspaceId, env),
    select: (data) => {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;
      const latestKey = decryptFileKey;
      const key = decryptAssymmetric({
        ciphertext: latestKey.encryptedKey,
        nonce: latestKey.nonce,
        publicKey: latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const sharedSecrets: DecryptedSecret[] = [];
      const personalSecrets: Record<string, { id: string; value: string }> = {};
      // this used for add-only mode in dashboard
      // type won't be there thus only one key is shown
      const duplicateSecretKey: Record<string, boolean> = {};
      data.forEach((encSecret) => {
        const secretKey = decryptSymmetric({
          ciphertext: encSecret.secretKeyCiphertext,
          iv: encSecret.secretKeyIV,
          tag: encSecret.secretKeyTag,
          key
        });

        const secretValue = decryptSymmetric({
          ciphertext: encSecret.secretValueCiphertext,
          iv: encSecret.secretValueIV,
          tag: encSecret.secretValueTag,
          key
        });

        const secretComment = decryptSymmetric({
          ciphertext: encSecret.secretCommentCiphertext,
          iv: encSecret.secretCommentIV,
          tag: encSecret.secretCommentTag,
          key
        });

        const decryptedSecret = {
          _id: encSecret._id,
          env: encSecret.environment,
          key: secretKey,
          value: secretValue,
          tags: encSecret.tags,
          comment: secretComment,
          createdAt: encSecret.createdAt,
          updatedAt: encSecret.updatedAt
        };

        if (encSecret.type === 'personal') {
          personalSecrets[decryptedSecret.key] = { id: encSecret._id, value: secretValue };
        } else {
          if (!duplicateSecretKey?.[decryptedSecret.key]) {
            sharedSecrets.push(decryptedSecret);
          }
          duplicateSecretKey[decryptedSecret.key] = true;
        }
      });
      sharedSecrets.forEach((val) => {
        if (personalSecrets?.[val.key]) {
          val.idOverride = personalSecrets[val.key].id;
          val.valueOverride = personalSecrets[val.key].value;
          val.overrideAction = 'modified';
        }
      });

      return { secrets: sharedSecrets };
    }
  });

const fetchEncryptedSecretVersion = async (secretId: string, offset: number, limit: number) => {
  const { data } = await apiRequest.get<{ secretVersions: EncryptedSecretVersion[] }>(
    `/api/v1/secret/${secretId}/secret-versions`,
    {
      params: {
        limit,
        offset
      }
    }
  );
  return data.secretVersions;
};

export const useGetSecretVersion = (dto: GetSecretVersionsDTO) =>
  useQuery({
    enabled: Boolean(dto.secretId && dto.decryptFileKey),
    queryKey: secretKeys.getSecretVersion(dto.secretId),
    queryFn: () => fetchEncryptedSecretVersion(dto.secretId, dto.offset, dto.limit),
    select: (data) => {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;
      const latestKey = dto.decryptFileKey;
      const key = decryptAssymmetric({
        ciphertext: latestKey.encryptedKey,
        nonce: latestKey.nonce,
        publicKey: latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      return data
        .map((el) => ({
          createdAt: el.createdAt,
          id: el._id,
          value: decryptSymmetric({
            ciphertext: el.secretValueCiphertext,
            iv: el.secretValueIV,
            tag: el.secretValueTag,
            key
          })
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  });

export const useBatchSecretsOp = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, BatchSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post('/api/v2/secrets/batch', dto);
      return data;
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries(secretKeys.getProjectSecret(dto.workspaceId, dto.environment));
      queryClient.invalidateQueries(secretSnapshotKeys.list(dto.workspaceId));
      queryClient.invalidateQueries(secretSnapshotKeys.count(dto.workspaceId));
    }
  });
};
