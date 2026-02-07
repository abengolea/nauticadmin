"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Player } from "@/lib/types";
import { useRouter } from "next/navigation";
import { calculateAge } from "@/lib/utils";

export function PlayerTable({ players }: { players: Player[] }) {
  const router = useRouter();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => (
            <TableRow
              key={player.id}
              className="cursor-pointer"
              onClick={() => router.push(`/dashboard/players/${player.id}`)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={player.avatarUrl} alt={player.firstName} data-ai-hint="person portrait" />
                    <AvatarFallback>{player.firstName[0]}{player.lastName[0]}</AvatarFallback>
                  </Avatar>
                  <span>{player.firstName} {player.lastName}</span>
                </div>
              </TableCell>
              <TableCell>{player.category}</TableCell>
              <TableCell>{player.primaryPosition}</TableCell>
              <TableCell>{calculateAge(player.birthDate)}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    player.status === "active"
                      ? "secondary"
                      : player.status === "injured"
                      ? "destructive"
                      : "outline"
                  }
                  className={player.status === "active" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}
                >
                  {player.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
