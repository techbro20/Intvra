import { useMemo, useState } from "react";
import { Badge, Input, Card, Empty, Button } from "@/components";
import { useHistory } from "@/hooks";
import { PageLayout } from "@/layouts";
import {
  CheckSquareIcon,
  MessageCircleIcon,
  Search,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const conversations = useHistory();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleConversations = useMemo(
    () =>
      conversations.conversations.filter((conversation) =>
        conversations.search.length === 0
          ? true
          : conversation.title
              .toLowerCase()
              .includes(conversations.search.toLowerCase())
      ),
    [conversations.conversations, conversations.search]
  );

  const { groupedConversations, sortedDates } = useMemo(() => {
    const grouped = visibleConversations.reduce(
      (acc, doc) => {
        const dateKey = moment(doc.updatedAt).format("YYYY-MM-DD");
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(doc);
        return acc;
      },
      {} as Record<string, typeof visibleConversations>
    );

    // YYYY-MM-DD keys sort correctly as strings; most recent first
    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    return { groupedConversations: grouped, sortedDates: dates };
  }, [visibleConversations]);

  const toggleSelected = (conversationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedIds(new Set(visibleConversations.map((c) => c.id)));
  };

  const clearSelected = () => {
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    const selected = Array.from(selectedIds);
    if (selected.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selected.length} selected conversation${
        selected.length === 1 ? "" : "s"
      }? This cannot be undone.`
    );
    if (!confirmed) return;
    await conversations.handleDeleteConversations(selected);
    clearSelected();
  };

  const keepSelectedOnly = async () => {
    const selected = Array.from(selectedIds);
    if (selected.length === 0) return;
    const deleteCount = conversations.conversations.length - selected.length;
    if (deleteCount <= 0) return;
    const confirmed = window.confirm(
      `Keep ${selected.length} selected conversation${
        selected.length === 1 ? "" : "s"
      } and delete the other ${deleteCount}? This cannot be undone.`
    );
    if (!confirmed) return;
    await conversations.handleKeepOnlyConversations(selected);
    clearSelected();
  };

  return (
    <PageLayout
      title="All conversations"
      description="View all your conversations"
    >
      <>
        {conversations.conversations.length === 0 ? (
          <Empty
            isLoading={conversations.isLoading}
            icon={MessageCircleIcon}
            title="No conversations found"
            description="Start a new conversation to get started"
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:w-1/2 lg:w-1/3">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={conversations.search}
                  onChange={(e) => conversations.setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectVisible}
                  disabled={visibleConversations.length === 0}
                >
                  <CheckSquareIcon className="size-4" />
                  Select Visible
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelected}
                  disabled={selectedIds.size === 0}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={keepSelectedOnly}
                  disabled={selectedIds.size === 0}
                >
                  Keep Selected
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                  disabled={selectedIds.size === 0}
                >
                  <Trash2Icon className="size-4" />
                  Delete Selected
                </Button>
              </div>
            </div>
            {selectedIds.size > 0 ? (
              <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                {selectedIds.size} selected. Use Keep Selected to delete every
                other conversation.
              </div>
            ) : null}
            {sortedDates
              .map((dateKey) => (
                <div key={dateKey} className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground select-none font-medium">
                    {moment(dateKey).format("ddd, MMM D")}
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((doc) => (
                      <Card
                        key={doc.id}
                        className={`shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer ${
                          selectedIds.has(doc.id) ? "!border-primary" : ""
                        }`}
                        onClick={() =>
                          selectedIds.size > 0
                            ? toggleSelected(doc.id)
                            : navigate(`/chats/view/${doc.id}`)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <button
                              type="button"
                              className="grid size-7 flex-none place-items-center rounded-md border text-muted-foreground transition-colors hover:text-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSelected(doc.id);
                              }}
                              title={
                                selectedIds.has(doc.id)
                                  ? "Unselect conversation"
                                  : "Select conversation"
                              }
                            >
                              {selectedIds.has(doc.id) ? (
                                <CheckSquareIcon className="size-4" />
                              ) : (
                                <SquareIcon className="size-4" />
                              )}
                            </button>
                            <p className="line-clamp-1 text-sm mr-8">
                              {doc.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.messageCount} messages
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {moment(doc.updatedAt).format("hh:mm A")}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </>
    </PageLayout>
  );
};

export default Dashboard;
