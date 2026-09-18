import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m as motion } from "@/lib/lazy-motion";

interface ChannelInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
}

const ChannelInput = ({ onAnalyze, isLoading }: ChannelInputProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onAnalyze(url.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xl mx-auto"
    >
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Channel URL, @handle, or video link..."
            className="pl-10 h-12 bg-card/60 border-border/40 text-foreground placeholder:text-muted-foreground/50 text-sm rounded-full focus-visible:ring-primary/40 backdrop-blur-xl"
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !url.trim()}
          variant="pill"
          size="pillLg"
          className="font-semibold"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Analyze"
          )}
        </Button>
      </form>
      <p className="text-muted-foreground/50 text-[11px] mt-2 text-center">
        youtube.com/c/... · youtube.com/@... · any video URL
      </p>
    </motion.div>
  );
};

export default ChannelInput;
