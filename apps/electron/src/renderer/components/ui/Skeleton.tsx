type SkeletonProps = {
  className?: string;
};

export default function Skeleton(props: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(226,232,240,0.9)_0%,rgba(241,245,249,1)_50%,rgba(226,232,240,0.9)_100%)] bg-[length:200%_100%] ${props.className ?? ""}`}
    />
  );
}
