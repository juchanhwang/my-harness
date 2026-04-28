import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import type { OrdersResponse } from "@/components/orders/types";

import OrderList from "@/components/orders/OrderList";

const PAGE_SIZE = 10;

async function fetchOrders(
  page: number,
  status?: string,
): Promise<OrdersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  if (status && status !== "all") {
    params.set("status", status);
  }

  const res = await fetch(
    `${process.env.API_BASE_URL}/api/orders?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("주문 목록을 불러오지 못했습니다.");
  return res.json();
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageParam, status: statusParam } = await searchParams;
  const page = Number(pageParam ?? "1");
  const status = statusParam ?? "all";

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: ["orders", { page, status }],
    queryFn: () => fetchOrders(page, status),
  });

  return (
    <main className="container mx-auto py-8">
      <h1 className="mb-6 text-2xl font-bold">주문 목록</h1>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <OrderList />
      </HydrationBoundary>
    </main>
  );
}
