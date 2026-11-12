export interface ApiCollectionSummary {
    path: string;
    name: string;
    total: number;
}
export declare function listApiCollections(): ApiCollectionSummary[];
export declare function queueApiCollectionRun(options: {
    collectionPath: string;
    environmentId?: string;
    scheduleId?: string;
    triggerType?: "manual" | "schedule";
}): {
    items: never[];
    id: string;
    collection_path: string;
    collection_name: string;
    schedule_id: string;
    trigger_type: "manual" | "schedule";
    environment_id: string;
    status: string;
    total: number;
    passed: number;
    failed: number;
    duration: number;
    started_at: string;
    ended_at: null;
    created_at: string;
};
