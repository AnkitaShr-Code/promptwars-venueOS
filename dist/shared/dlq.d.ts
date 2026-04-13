export declare class DeadLetterQueue {
    private readonly REDIS_KEY;
    private readonly MAX_SIZE;
    push(event: any, reason: string): Promise<void>;
    getRecent(count?: number): Promise<any[]>;
}
export declare const dlq: DeadLetterQueue;
