"use client";

import { NodeProps } from "@xyflow/react";
import { Image as ImageIcon } from "lucide-react";
import { BucketNodeBase } from "./BucketNodeBase";

export function ImageBucketNode({ id }: NodeProps) {
  return <BucketNodeBase id={id} bucketType="image" icon={ImageIcon} />;
}
