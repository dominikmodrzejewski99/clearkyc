package com.example.clearkyc.analysis;

import java.util.List;

public record RedFlagItem(RedFlagCategory category, String description, List<Citation> citations) {
}
