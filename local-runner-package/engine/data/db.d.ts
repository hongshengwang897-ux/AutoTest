export declare function createId(): string;
export declare function now(): string;
/** 获取表的所有行，自动解析 JSON 字段 */
export declare function all(table: string): Record<string, any>[];
/** 根据 ID 获取一行 */
export declare function get(table: string, id: string): Record<string, any> | null;
/** 插入一行（自动忽略不在表结构中的未知列） */
export declare function insert(table: string, data: Record<string, any>): void;
/** 更新一行（自动忽略不在表结构中的未知列） */
export declare function update(table: string, id: string, data: Record<string, any>): boolean;
/** 删除一行 */
export declare function remove(table: string, id: string): boolean;
/** 执行原始 SQL（用于复杂查询），自动展开 JSON 字段 */
export declare function query(sql: string, ...params: any[]): Record<string, any>[];
/** 执行写入 SQL */
export declare function exec(sql: string, ...params: any[]): number;
/** 压缩 JSON 字段用于写入 */
export declare function compactRow(table: string, data: Record<string, any>): Record<string, any>;
/** 关闭数据库（进程退出时调用） */
export declare function closeDb(): void;
