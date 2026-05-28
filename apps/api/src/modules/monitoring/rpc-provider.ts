import { createPublicClient, http, type Address, type Hex } from "viem";

export interface ObservedLog {
  address: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  topics: string[];
  data: string;
}

export interface ObservedTransaction {
  hash: string;
  blockNumber: bigint;
  blockHash: string;
  from: string | null;
  to: string | null;
  input: string;
  value: bigint | null;
}

export interface EvmReadOnlyProvider {
  getLatestBlockNumber(): Promise<bigint>;
  getLogs(input: { address: string; fromBlock: bigint; toBlock: bigint }): Promise<ObservedLog[]>;
  getTransaction(hash: string): Promise<ObservedTransaction | null>;
  getBlockTransactions?(blockNumber: bigint): Promise<ObservedTransaction[]>;
  getStorageAt?(input: { address: string; slot: string; blockNumber: bigint }): Promise<string | null>;
}

export class ViemReadOnlyProvider implements EvmReadOnlyProvider {
  private readonly client: ReturnType<typeof createPublicClient>;

  constructor(rpcUrl: string) {
    this.client = createPublicClient({
      transport: http(rpcUrl, { retryCount: 2 })
    });
  }

  async getLatestBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async getLogs(input: { address: string; fromBlock: bigint; toBlock: bigint }): Promise<ObservedLog[]> {
    const logs = await this.client.getLogs({
      address: input.address as Address,
      fromBlock: input.fromBlock,
      toBlock: input.toBlock
    });
    return logs.map((log) => ({
      address: log.address,
      blockNumber: log.blockNumber ?? 0n,
      blockHash: log.blockHash ?? "0x",
      transactionHash: log.transactionHash ?? "0x",
      logIndex: log.logIndex ?? 0,
      topics: [...(((log as { topics?: readonly string[] }).topics) ?? [])],
      data: log.data
    }));
  }

  async getTransaction(hash: string): Promise<ObservedTransaction | null> {
    try {
      const tx = await this.client.getTransaction({ hash: hash as Hex });
      return {
        hash: tx.hash,
        blockNumber: tx.blockNumber ?? 0n,
        blockHash: tx.blockHash ?? "0x",
        from: tx.from ?? null,
        to: tx.to ?? null,
        input: tx.input,
        value: tx.value ?? null
      };
    } catch {
      return null;
    }
  }

  async getBlockTransactions(blockNumber: bigint): Promise<ObservedTransaction[]> {
    const block = await this.client.getBlock({ blockNumber, includeTransactions: true });
    return block.transactions
      .filter((transaction): transaction is Extract<typeof transaction, { hash: Hex }> => typeof transaction !== "string")
      .map((tx) => ({
        hash: tx.hash,
        blockNumber: tx.blockNumber ?? blockNumber,
        blockHash: tx.blockHash ?? block.hash ?? "0x",
        from: tx.from ?? null,
        to: tx.to ?? null,
        input: tx.input,
        value: tx.value ?? null
      }));
  }

  async getStorageAt(input: { address: string; slot: string; blockNumber: bigint }): Promise<string | null> {
    try {
      return (await this.client.getStorageAt({
        address: input.address as Address,
        slot: input.slot as Hex,
        blockNumber: input.blockNumber
      })) ?? null;
    } catch {
      return null;
    }
  }
}

export function inputSelector(input: string | null | undefined): string | null {
  if (!input || input.length < 10 || !input.startsWith("0x")) return null;
  return input.slice(0, 10).toLowerCase();
}
