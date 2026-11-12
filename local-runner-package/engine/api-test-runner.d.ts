export interface KeyValueItem {
    id?: string;
    key: string;
    value: string;
    enabled?: boolean;
}
export interface ApiAssertion {
    id?: string;
    source: "status" | "body" | "header" | "json";
    operator: "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
    target?: string;
    expected?: string;
}
export interface ApiTestDefinition {
    id?: string;
    name?: string;
    method?: string;
    url?: string;
    headers?: KeyValueItem[];
    queryParams?: KeyValueItem[];
    bodyType?: "none" | "json" | "text" | "form";
    body?: string;
    assertions?: ApiAssertion[];
    variables?: Record<string, string>;
    environmentId?: string;
    timeoutMs?: number;
}
export declare function runApiTest(definition: ApiTestDefinition): Promise<{
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    assertion_results: {
        id: string;
        source: "status" | "body" | "header" | "json";
        operator: "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
        target: string;
        expected: string;
        actual: string;
        passed: boolean;
        message: string;
    }[];
    id: string;
    case_id: string;
    case_name: string;
    status: string;
    method: string;
    url: string;
    status_code: number;
    duration: number;
    response_size: number;
    request_body: string;
    response_body: string;
    error_message: null;
    created_at: string;
} | {
    request_headers: Record<string, string>;
    response_headers: {};
    assertion_results: never[];
    id: string;
    case_id: string;
    case_name: string;
    status: string;
    method: string;
    url: string;
    status_code: null;
    duration: number;
    response_size: number;
    request_body: string;
    response_body: string;
    error_message: string;
    created_at: string;
}>;
