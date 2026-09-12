import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileQuestion, ArrowLeft } from "@/lib/icons";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <FileQuestion className="text-muted-foreground h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Page not found</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground text-sm">
            The page you are looking for does not exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
