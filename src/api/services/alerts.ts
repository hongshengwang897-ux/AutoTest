import { get, post, put, del } from "../client";
import { API } from "../endpoints";

export interface AlertItem {
  id: string;
  name: string;
  channel: "dingtalk" | "feishu" | "email" | "webhook";
  webhookUrl: string;
  notifyLevels: string[];
  /** 适用模块：勾选了哪个模块，该模块执行完成才用此通道通知 */
  modules: string[];
  template: string;
  /** 测试消息模板：仅用于手动发送测试消息，不用于执行结果推送 */
  testTemplate?: string;
  enabled: boolean;
  /** 通道扩展配置，如钉钉加签密钥 { secret } */
  config?: { secret?: string };
}

export const alertsService = {
  list() {
    return get<{ items: AlertItem[] }>(API.alerts);
  },
  create(data: Partial<AlertItem>) {
    return post<AlertItem>(API.alerts, data);
  },
  update(id: string, data: Partial<AlertItem>) {
    return put<AlertItem>(API.alert(id), data);
  },
  test(id: string) {
    return post<{ message: string }>(API.alertTest(id));
  },
  remove(id: string) {
    return del(API.alert(id));
  },
};
