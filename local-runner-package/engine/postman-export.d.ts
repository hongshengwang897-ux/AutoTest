export interface ApiCaseForExport {
    id: string;
    name: string;
    description: string;
    method: string;
    url: string;
    headers: Array<{
        key: string;
        value: string;
        enabled?: boolean;
    }>;
    queryParams: Array<{
        key: string;
        value: string;
        enabled?: boolean;
    }>;
    bodyType: "none" | "json" | "text" | "form";
    body: string;
    assertions: Array<{
        id?: string;
        source: "status" | "body" | "header" | "jsonPath";
        operator: string;
        target: string;
        expected: string;
    }>;
    variables: Record<string, string>;
    group: string;
}
interface PostmanRequest {
    auth?: PostmanAuth;
    body?: PostmanBody;
    description?: string;
    header: PostmanHeader[];
    method: string;
    name: string;
    url: PostmanUrl;
}
interface PostmanAuth {
    type: string;
    bearer?: Array<{
        key: string;
        value: string;
    }>;
    basic?: Array<{
        key: string;
        value: string;
    }>;
    apikey?: Array<{
        key: string;
        value: string;
    }>;
}
interface PostmanBody {
    mode: string;
    raw?: string;
    urlencoded?: PostmanHeader[];
    formdata?: Array<{
        key: string;
        value: string;
        type: "text";
    }>;
    graphql?: {
        query: string;
        variables?: string;
    };
    options?: {
        raw: {
            language: string;
        };
    };
}
interface PostmanHeader {
    key: string;
    value: string;
    description?: string;
}
interface PostmanUrl {
    raw: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanHeader[];
}
interface PostmanItem {
    id?: string;
    name: string;
    description?: string;
    request?: PostmanRequest;
    event?: PostmanEvent[];
    variable?: PostmanVariable[];
    item?: PostmanItem[];
}
interface PostmanEvent {
    listen: string;
    script: {
        type?: string;
        exec: string[];
    };
}
interface PostmanVariable {
    id?: string;
    key: string;
    value: string;
    type?: string;
}
interface PostmanCollection {
    info: {
        _postman_id: string;
        name: string;
        schema: string;
        description?: string;
    };
    item: PostmanItem[];
    variable?: PostmanVariable[];
}
export declare function exportToPostmanCollection(cases: ApiCaseForExport[], collectionName?: string): PostmanCollection;
export declare function getCasesForExport(): ApiCaseForExport[];
export {};
