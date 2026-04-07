#!/usr/bin/env bash
# logs.sh — interactive container log viewer for boardupscale
# Usage:
#   bash scripts/logs.sh              # interactive picker
#   bash scripts/logs.sh api          # jump straight to a service
#   bash scripts/logs.sh api -f       # follow live
#   bash scripts/logs.sh api --tail=50

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

B="\033[1m"; R="\033[0m"; BLU="\033[94m"; GRN="\033[92m"
YLW="\033[93m"; CYN="\033[96m"; DIM="\033[2m"; RED="\033[91m"

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"

# ── Resolve running containers for this project ───────────────────────────
get_containers() {
    docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null \
        | grep -i "boardupscale\|infra-bu\|bu-" \
        | sort
}

# ── Also list ALL containers (cross-project mode) ─────────────────────────
get_all_containers() {
    docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null | sort
}

# ── Pretty container list ─────────────────────────────────────────────────
print_containers() {
    local containers=("$@")
    local i=1
    printf "\n  ${DIM}%-4s %-38s %-22s %s${R}\n" "#" "Container" "Status" "Image"
    printf "  ${DIM}%-4s %-38s %-22s %s${R}\n" "─" "──────────────────────────────────" "──────────────────" "──────"
    for entry in "${containers[@]}"; do
        local name status image
        name=$(echo "$entry" | cut -f1)
        status=$(echo "$entry" | cut -f2)
        image=$(echo "$entry" | cut -f3 | cut -d: -f1 | awk -F/ '{print $NF}')
        if [[ "$status" == Up* ]]; then
            status_col="${GRN}● up${R}"
        else
            status_col="${RED}● down${R}"
        fi
        printf "  ${CYN}%-4s${R} ${B}%-38s${R} %b  ${DIM}%s${R}\n" "$i" "$name" "$status_col" "$image"
        ((i++))
    done
}

show_logs() {
    local container="$1"; shift
    local extra_args=("$@")

    # default: last 50 lines
    local has_tail=false
    for arg in "${extra_args[@]}"; do
        [[ "$arg" == --tail* ]] && has_tail=true
    done
    $has_tail || extra_args=("--tail=50" "${extra_args[@]}")

    printf "\n${B}${BLU}── Logs: ${CYN}%s${R}  ${DIM}%s${R}\n\n" \
        "$container" "${extra_args[*]}"
    docker logs "$container" "${extra_args[@]}" 2>&1
}

resolve_container_name() {
    # Given a service shortname (api, worker, postgres...) try to find the
    # real container name. Checks: exact match → boardupscale prefix → infra-bu prefix
    local svc="$1"
    local found
    found=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -m1 -E "^${svc}$")
    [ -n "$found" ] && { echo "$found"; return; }
    found=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -m1 -iE "boardupscale-${svc}-|infra-bu-${svc}-|bu-${svc}-")
    [ -n "$found" ] && { echo "$found"; return; }
    # fallback: any container containing the service name
    found=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -m1 -i "${svc}")
    echo "$found"
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
    local service="$1"
    shift 2>/dev/null || true
    local extra_args=("$@")

    printf "${B}${BLU}╔══════════════════════════════════════════════════════╗${R}\n"
    printf "${B}${BLU}║       boardupscale  ·  Container Logs                ║${R}\n"
    printf "${B}${BLU}╚══════════════════════════════════════════════════════╝${R}\n"

    # Check docker available
    if ! docker info &>/dev/null 2>&1; then
        printf "\n  ${RED}✗  Docker is not running.${R}\n\n"
        exit 1
    fi

    # ── If service name passed as arg, resolve and show directly ──────────
    if [ -n "$service" ]; then
        container=$(resolve_container_name "$service")
        if [ -z "$container" ]; then
            printf "\n  ${RED}✗  No running container found for '${service}'${R}\n"
            printf "  ${DIM}Tip: run without args to see all containers${R}\n\n"
            exit 1
        fi
        show_logs "$container" "${extra_args[@]}"
        return
    fi

    # ── Gather containers (bash 3 compatible) ────────────────────────────
    IFS=$'\n' read -r -d '' -a bu_containers  < <(get_containers;  printf '\0')
    IFS=$'\n' read -r -d '' -a all_containers < <(get_all_containers; printf '\0')

    # ── Show boardupscale containers first ────────────────────────────────
    if [ ${#bu_containers[@]} -gt 0 ]; then
        printf "\n  ${B}Boardupscale containers:${R}"
        print_containers "${bu_containers[@]}"
    else
        printf "\n  ${YLW}⚠  No boardupscale containers running.${R}\n"
        printf "  ${DIM}Tip: docker compose up -d${R}\n"
    fi

    # ── Option to show all ────────────────────────────────────────────────
    if [ ${#all_containers[@]} -gt ${#bu_containers[@]} ]; then
        printf "\n  ${DIM}[a]  Show all %d containers (all projects)${R}\n" "${#all_containers[@]}"
    fi

    # ── Prompt ────────────────────────────────────────────────────────────
    printf "\n  ${YLW}?${R} Enter ${B}number${R}, ${B}container name${R}, or ${B}a${R} for all: "
    read -r choice

    # Show all containers if 'a'
    if [[ "$choice" == "a" ]]; then
        printf "\n  ${B}All running containers:${R}"
        print_containers "${all_containers[@]}"
        printf "\n  ${YLW}?${R} Enter number or container name: "
        read -r choice
        IFS=$'\n' read -r -d '' -a active_list < <(printf '%s\n' "${all_containers[@]}"; printf '\0')
    else
        active_list=("${bu_containers[@]}")
    fi

    # Resolve choice → container name
    local container=""
    if [[ "$choice" =~ ^[0-9]+$ ]]; then
        local idx=$(( choice - 1 ))
        if [ $idx -ge 0 ] && [ $idx -lt ${#active_list[@]} ]; then
            container=$(echo "${active_list[$idx]}" | cut -f1)
        fi
    else
        # treat as name or partial name
        container=$(resolve_container_name "$choice")
        [ -z "$container" ] && container="$choice"
    fi

    if [ -z "$container" ]; then
        printf "\n  ${RED}✗  Invalid choice.${R}\n\n"
        exit 1
    fi

    # ── Tail lines ────────────────────────────────────────────────────────
    printf "\n  ${YLW}?${R} How many lines? ${DIM}[50]${R}: "
    read -r lines
    lines="${lines:-50}"

    # ── Follow? ───────────────────────────────────────────────────────────
    printf "  ${YLW}?${R} Follow live output? ${DIM}[y/N]${R}: "
    read -r follow
    if [[ "$follow" =~ ^[Yy] ]]; then
        show_logs "$container" "--tail=${lines}" "-f"
    else
        show_logs "$container" "--tail=${lines}"
    fi
}

main "$@"
