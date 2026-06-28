import adminLogo from "../assets/admin-logo.svg";

type Props = {
  className?: string;
  width?: number;
  height?: number;
};

export function AdminLogo({
  className = "size-8 shrink-0 rounded-lg object-contain",
  width,
  height,
}: Props) {
  return <img src={adminLogo} alt="tabipla" width={width} height={height} className={className} />;
}
