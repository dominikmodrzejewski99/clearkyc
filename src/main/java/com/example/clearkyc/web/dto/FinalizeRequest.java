package com.example.clearkyc.web.dto;

import com.example.clearkyc.domain.DecisionType;

import java.util.List;

public record FinalizeRequest(
        DecisionType decision,
        List<FieldRecord> fields) {
}
