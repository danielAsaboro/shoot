'use client'

import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { PublicKey, Cluster } from '@solana/web3.js'

function getBasicProgramId(cluster: Cluster): PublicKey {
  // Basic example program ID - replace with actual deployed program ID
  return new PublicKey('11111111111111111111111111111111')
}

function getBasicProgram(provider: AnchorProvider, programId: PublicKey) {
  // For now return a minimal program interface
  return {
    methods: {
      greet: () => ({
        rpc: async () => 'placeholder-signature'
      })
    }
  }
}
import { useConnection } from '@solana/wallet-adapter-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'

export function useBasicProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getBasicProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getBasicProgram(provider, programId), [provider, programId])

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const greet = useMutation({
    mutationKey: ['basic', 'greet', { cluster }],
    mutationFn: () => program.methods.greet().rpc(),
    onSuccess: (signature) => {
      transactionToast(signature)
    },
    onError: () => {
      toast.error('Failed to run program')
    },
  })

  return {
    program,
    programId,
    getProgramAccount,
    greet,
  }
}
