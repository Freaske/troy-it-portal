"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StudentReviewFormProps = {
  courseCode: string;
  lecturers: Array<{
    id: string;
    name: string;
  }>;
};

export function StudentReviewForm({ courseCode, lecturers }: StudentReviewFormProps) {
  const router = useRouter();

  const [lecturerId, setLecturerId] = useState("");
  const [rating, setRating] = useState("5");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseCode,
          lecturerId: lecturerId || null,
          rating,
          content,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Cannot submit review.");
        return;
      }

      setMessage("Review submitted successfully.");
      setContent("");
      setRating("5");
      setLecturerId("");
      router.refresh();
    } catch {
      setError("Cannot connect to review service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
      <label>
        Lecturer (optional)
        <select value={lecturerId} onChange={(event) => setLecturerId(event.target.value)}>
          <option value="">General course review</option>
          {lecturers.map((lecturer) => (
            <option key={lecturer.id} value={lecturer.id}>
              {lecturer.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Rating
        <select value={rating} onChange={(event) => setRating(event.target.value)}>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Weak</option>
          <option value="1">1 - Very poor</option>
        </select>
      </label>

      <label className="review-form-full">
        Your comment
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Share your learning experience (minimum 12 characters)."
          rows={4}
          required
          minLength={12}
        />
      </label>

      <div className="review-form-actions">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Review"}
        </button>
      </div>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </form>
  );
}
