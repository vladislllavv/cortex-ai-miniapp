import { useState } from "react";

interface MemberAvatarProps {
  displayName: string;
  photoUrl?: string;
  size?: number;
  color?: string;
}

export default function MemberAvatar({
  displayName,
  photoUrl,
  size = 34,
  color = "#3b82f6",
}: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = displayName.charAt(0).toUpperCase();

  // Если есть фото и оно загрузилось — показываем
  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={displayName}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: `1px solid ${color}50`,
          flexShrink: 0,
          backgroundColor: `${color}30`,
        }}
      />
    );
  }

  // Фолбэк — буква
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: `${color}30`,
        border: `1px solid ${color}50`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        color: color,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
