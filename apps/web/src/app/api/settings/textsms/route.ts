import { getList } from "@/server/erp/iot-routes";
import { getTextSms } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether TextSMS is set up on the server (nothing about the account is returned). */
export const GET = getList((c) => getTextSms(c));
