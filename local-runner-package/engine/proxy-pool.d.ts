import { ProxyAgent } from "undici";
export interface ProxyPoolRuntime {
    proxies: string[];
    agents: ProxyAgent[];
    cursor: number;
}
export interface ProxySelection {
    server: string;
    agent: ProxyAgent;
}
export declare function getAvailableProxies(): Promise<string[]>;
export declare function checkProxyPoolAvailability(): Promise<{
    available: boolean;
    count: number;
    source: string;
    message: string;
}>;
export declare function createProxyPoolRuntime(): Promise<ProxyPoolRuntime>;
export declare function nextProxy(pool: ProxyPoolRuntime): ProxySelection;
export declare function closeProxyPool(pool?: ProxyPoolRuntime): Promise<void>;
