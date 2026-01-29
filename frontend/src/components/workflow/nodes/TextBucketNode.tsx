"use client";

import { NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { BucketNodeBase } from "./BucketNodeBase";

export function TextBucketNode({ id }: NodeProps) {
  return <BucketNodeBase id={id} bucketType="text" icon={FileText} />;
}
