import { fireEvent, render, screen } from "@testing-library/react-native";
import { MessageBubble } from "@/components/MessageBubble";
import { TransactionRow } from "@/components/TransactionRow";
import type { Transaction } from "@/lib/api";

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  type: "debit",
  amountKobo: 1_000_000,
  description: "MTN airtime",
  createdAt: new Date().toISOString(),
  status: "successful",
  ...over,
});

describe("TransactionRow", () => {
  it("shows amount with sign and an accessible summary", async () => {
    await render(<TransactionRow txn={txn()} />);
    expect(screen.getByText("-₦10,000.00")).toBeTruthy();
    expect(screen.getByLabelText("MTN airtime, paid ₦10,000.00, successful")).toBeTruthy();
  });

  it("labels pending and failed transactions", async () => {
    await render(<TransactionRow txn={txn({ status: "pending" })} />);
    expect(screen.getByText(/Pending/)).toBeTruthy();
  });
});

describe("MessageBubble", () => {
  it("offers a retry for failed messages", async () => {
    const onRetry = jest.fn();
    await render(<MessageBubble message={{ id: "m1", role: "user", text: "hi", status: "failed", error: "You appear to be offline." }} onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole("button", { name: "Retry sending message" }));
    expect(onRetry).toHaveBeenCalledWith("m1");
  });

  it("has no retry control for sent messages", async () => {
    await render(<MessageBubble message={{ id: "m2", role: "assistant", text: "Hello", status: "sent" }} onRetry={jest.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
