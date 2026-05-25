import { createHash } from "node:crypto";

export function craftHash(sectionJson: string, answersJson: string, designMdHash: string): string {
  return createHash("sha256")
    .update(sectionJson)
    .update(answersJson)
    .update(designMdHash)
    .digest("hex");
}
