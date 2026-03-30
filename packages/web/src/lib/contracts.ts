import { sepolia } from 'wagmi/chains'

export const FITSTAKE_ADDRESS = process.env.NEXT_PUBLIC_FITSTAKE_ADDRESS as `0x${string}`
export const FITSTAKE_VRF_ADDRESS = process.env.NEXT_PUBLIC_FITSTAKE_VRF_ADDRESS as `0x${string}`
export const CHAIN = sepolia

export const FITSTAKE_ABI = [
  // Challenge Creation (direct wallet)
  {
    name: 'createChallenge',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'challengeType', type: 'uint8' },
      { name: 'distanceGoalCm', type: 'uint256' },
      { name: 'durationMinutes', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'maxParticipants', type: 'uint256' },
      { name: 'isPrivate', type: 'bool' },
      { name: 'inviteCodeHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  // Challenge Creation (server-side, on behalf of user)
  {
    name: 'createChallengeFor',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'participant', type: 'address' },
      { name: 'challengeType', type: 'uint8' },
      { name: 'distanceGoalCm', type: 'uint256' },
      { name: 'durationMinutes', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'maxParticipants', type: 'uint256' },
      { name: 'isPrivate', type: 'bool' },
      { name: 'inviteCodeHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  // Join (direct wallet)
  {
    name: 'joinChallenge',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'inviteCode', type: 'bytes' },
    ],
    outputs: [],
  },
  // Join (server-side, on behalf of user)
  {
    name: 'joinChallengeFor',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'participant', type: 'address' },
      { name: 'inviteCode', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'cancelChallenge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [],
  },
  // CRE functions
  {
    name: 'activateChallenge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'submitVerification',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'participant', type: 'address' },
      { name: 'distanceCm', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'submitBatchVerification',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'participants', type: 'address[]' },
      { name: 'distances', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    name: 'settle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [],
  },
  // View Functions
  {
    name: 'getChallenge',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'creator', type: 'address' },
          { name: 'challengeType', type: 'uint8' },
          { name: 'state', type: 'uint8' },
          { name: 'stakeAmount', type: 'uint256' },
          { name: 'distanceGoalCm', type: 'uint256' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'maxParticipants', type: 'uint256' },
          { name: 'isPrivate', type: 'bool' },
          { name: 'inviteCodeHash', type: 'bytes32' },
          { name: 'participantCount', type: 'uint256' },
          { name: 'totalStaked', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getParticipants',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'getParticipantDistance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nextChallengeId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'isParticipant',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'challengeId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Events
  {
    name: 'ChallengeCreated',
    type: 'event',
    inputs: [
      { name: 'challengeId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'challengeType', type: 'uint8', indexed: false },
      { name: 'stakeAmount', type: 'uint256', indexed: false },
      { name: 'distanceGoalCm', type: 'uint256', indexed: false },
      { name: 'startTime', type: 'uint256', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'ChallengeJoined',
    type: 'event',
    inputs: [
      { name: 'challengeId', type: 'uint256', indexed: true },
      { name: 'participant', type: 'address', indexed: true },
    ],
  },
  {
    name: 'ChallengeSettled',
    type: 'event',
    inputs: [
      { name: 'challengeId', type: 'uint256', indexed: true },
      { name: 'winnersCount', type: 'uint256', indexed: false },
      { name: 'totalPayout', type: 'uint256', indexed: false },
    ],
  },
] as const
