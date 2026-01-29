"use client";

import { NodeProps } from "@xyflow/react";
import { Video } from "lucide-react";
import { BucketNodeBase } from "./BucketNodeBase";

export function VideoBucketNode({ id }: NodeProps) {
  return <BucketNodeBase id={id} bucketType="video" icon={Video} />;
}
