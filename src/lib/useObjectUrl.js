import { useEffect, useState } from "react";

// Preview URL for a locally picked File. Held in state rather than created inline in
// render: an image picker lives on forms that re-render on every keystroke, and a fresh
// `URL.createObjectURL` per render leaks one blob each time. Revoked when the pick
// changes or the component unmounts.
export function useObjectUrl(file) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}
