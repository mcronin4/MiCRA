"use client";

import { NodeProps } from "@xyflow/react";
import { Music } from "lucide-react";
import { BucketNodeBase } from "./BucketNodeBase";

export function AudioBucketNode({ id }: NodeProps) {
  return <BucketNodeBase id={id} bucketType="audio" icon={Music} />;
}
